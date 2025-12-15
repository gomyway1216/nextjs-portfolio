// Learning Paths API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../constants';
import { logCloudFunctionError } from '../../../utils/errorLogger';

const endpoint = '/api/study/learning/paths';

// GET /api/study/learning/paths - Get learning paths
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const authHeader = request.headers.get('authorization');
    const url = new URL(getCloudFunctionUrl('getLearningPaths'));

    // Forward query parameters
    const params = ['status', 'limit'];
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
        functionName: 'getLearningPaths',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning Paths API] Error fetching paths:', error);
    await logCloudFunctionError({
      functionName: 'getLearningPaths',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch learning paths' },
      { status: 500 }
    );
  }
}

// POST /api/study/learning/paths - Create a new learning path (AI generated)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('createLearningPath'), {
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
        functionName: 'createLearningPath',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning Paths API] Error creating path:', error);
    await logCloudFunctionError({
      functionName: 'createLearningPath',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to create learning path' },
      { status: 500 }
    );
  }
}

// PUT /api/study/learning/paths - Update a learning path
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');
    const pathId = request.nextUrl.searchParams.get('pathId');

    const url = new URL(getCloudFunctionUrl('updateLearningPath'));
    if (pathId) url.searchParams.set('pathId', pathId);

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
        functionName: 'updateLearningPath',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { pathId },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning Paths API] Error updating path:', error);
    await logCloudFunctionError({
      functionName: 'updateLearningPath',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to update learning path' },
      { status: 500 }
    );
  }
}

// DELETE /api/study/learning/paths - Delete a learning path
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const pathId = request.nextUrl.searchParams.get('pathId');

    const url = new URL(getCloudFunctionUrl('deleteLearningPath'));
    if (pathId) url.searchParams.set('pathId', pathId);

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
        functionName: 'deleteLearningPath',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { pathId },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning Paths API] Error deleting path:', error);
    await logCloudFunctionError({
      functionName: 'deleteLearningPath',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to delete learning path' },
      { status: 500 }
    );
  }
}
