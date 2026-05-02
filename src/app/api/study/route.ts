// Study API - Main route for study tool operations
// This acts as a proxy to Firebase Cloud Functions

import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../constants';
import { logCloudFunctionError } from '../utils/errorLogger';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// Helper to forward requests to Firebase Functions
async function forwardToFirebase(
  functionName: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  request: NextRequest,
  body?: Record<string, unknown>
): Promise<NextResponse> {
  const url = getCloudFunctionUrl(functionName);

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // Forward authorization header if present
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName,
        endpoint: `/api/study?action=${functionName}`,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(`Error calling Firebase function ${functionName}:`, error);
    await logCloudFunctionError({
      functionName,
      endpoint: `/api/study?action=${functionName}`,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

// GET /api/study - Get study dashboard data
export const GET = withActivityLog('next_api.study.GET', async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');

  switch (action) {
    case 'categories':
      return forwardToFirebase('getStudyCategories', 'GET', request);

    case 'topics': {
      const categoryId = searchParams.get('categoryId');
      const isActive = searchParams.get('isActive');
      const url = new URL(getCloudFunctionUrl('getStudyTopics'));
      if (categoryId) url.searchParams.set('categoryId', categoryId);
      if (isActive) url.searchParams.set('isActive', isActive);

      const response = await fetch(url.toString());
      const data = await response.json();
      return NextResponse.json(data, { status: response.status });
    }

    case 'config':
      return forwardToFirebase('getStudyConfig', 'GET', request);

    case 'progress':
      return forwardToFirebase('getUserStudyProgress', 'GET', request);

    default:
      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      );
  }
});
