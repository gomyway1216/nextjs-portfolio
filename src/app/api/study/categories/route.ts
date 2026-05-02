// Study Categories API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../constants';
import { logApiError, logCloudFunctionError } from '../../utils/errorLogger';
import { ErrorSeverity } from '@/types/errors';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// GET /api/study/categories - Get all categories
export const GET = withActivityLog('next_api.study.categories.GET', async () => {
  const endpoint = '/api/study/categories';
  try {
    const response = await fetch(getCloudFunctionUrl('getStudyCategories'));
    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'getStudyCategories',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error fetching categories:', error);
    await logApiError({
      severity: ErrorSeverity.HIGH,
      errorType: 'StudyCategoriesAPI:FetchError',
      message: 'Failed to fetch categories',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint,
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
});

// POST /api/study/categories - Create a new category
export const POST = withActivityLog('next_api.study.categories.POST', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');
    const url = getCloudFunctionUrl('createStudyCategory');

    console.log('[DEBUG] Creating category:', {
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
    console.log('[DEBUG] Response headers:', Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log('[DEBUG] Response text:', responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('[DEBUG] Failed to parse response as JSON:', responseText);
      return NextResponse.json(
        { success: false, error: 'Invalid response from server', details: responseText },
        { status: 500 }
      );
    }

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'createStudyCategory',
        endpoint: '/api/study/categories',
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error creating category:', error);
    await logCloudFunctionError({
      functionName: 'createStudyCategory',
      endpoint: '/api/study/categories',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to create category', details: String(error) },
      { status: 500 }
    );
  }
});

// PUT /api/study/categories - Update a category
export const PUT = withActivityLog('next_api.study.categories.PUT', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('updateStudyCategory'), {
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
        functionName: 'updateStudyCategory',
        endpoint: '/api/study/categories',
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { categoryId: body.id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error updating category:', error);
    await logCloudFunctionError({
      functionName: 'updateStudyCategory',
      endpoint: '/api/study/categories',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to update category' },
      { status: 500 }
    );
  }
});

// DELETE /api/study/categories - Delete a category
export const DELETE = withActivityLog('next_api.study.categories.DELETE', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('deleteStudyCategory'), {
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
        functionName: 'deleteStudyCategory',
        endpoint: '/api/study/categories',
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { categoryId: body.id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error deleting category:', error);
    await logCloudFunctionError({
      functionName: 'deleteStudyCategory',
      endpoint: '/api/study/categories',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to delete category' },
      { status: 500 }
    );
  }
});

// PATCH /api/study/categories - Seed all default categories
export const PATCH = withActivityLog('next_api.study.categories.PATCH', async (request: NextRequest) => {
  try {
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('seedStudyCategories'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'seedStudyCategories',
        endpoint: '/api/study/categories',
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error seeding categories:', error);
    await logCloudFunctionError({
      functionName: 'seedStudyCategories',
      endpoint: '/api/study/categories',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to seed categories' },
      { status: 500 }
    );
  }
});
