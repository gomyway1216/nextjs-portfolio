// Study Topics API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../constants';
import { logApiError, logCloudFunctionError } from '../../utils/errorLogger';
import { ErrorSeverity } from '@/types/errors';

// GET /api/study/topics - Get topics with optional filters
export async function GET(request: NextRequest) {
  const endpoint = '/api/study/topics';
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = new URL(getCloudFunctionUrl('getStudyTopics'));

    // Forward query parameters
    const categoryId = searchParams.get('categoryId');
    const isActive = searchParams.get('isActive');

    if (categoryId) url.searchParams.set('categoryId', categoryId);
    if (isActive) url.searchParams.set('isActive', isActive);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'getStudyTopics',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details },
        metadata: { categoryId, isActive },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error fetching topics:', error);
    await logApiError({
      severity: ErrorSeverity.HIGH,
      errorType: 'StudyTopicsAPI:FetchError',
      message: 'Failed to fetch topics',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint,
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch topics' },
      { status: 500 }
    );
  }
}

// POST /api/study/topics - Create a new topic
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('createStudyTopic'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error creating topic:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create topic' },
      { status: 500 }
    );
  }
}

// PUT /api/study/topics - Update a topic
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('updateStudyTopic'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error updating topic:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update topic' },
      { status: 500 }
    );
  }
}

// DELETE /api/study/topics - Delete a topic
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('deleteStudyTopic'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error deleting topic:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete topic' },
      { status: 500 }
    );
  }
}
