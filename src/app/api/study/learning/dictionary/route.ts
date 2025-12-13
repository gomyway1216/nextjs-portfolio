// Dictionary Terms API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../constants';
import { logCloudFunctionError } from '../../../utils/errorLogger';

const endpoint = '/api/study/learning/dictionary';

// GET /api/study/learning/dictionary - Get dictionary terms
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const authHeader = request.headers.get('authorization');
    const url = new URL(getCloudFunctionUrl('getDictionaryTerms'));

    // Forward query parameters
    const params = ['category', 'search', 'limit'];
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
        functionName: 'getDictionaryTerms',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error fetching dictionary terms:', error);
    await logCloudFunctionError({
      functionName: 'getDictionaryTerms',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch dictionary terms' },
      { status: 500 }
    );
  }
}

// POST /api/study/learning/dictionary - Create a new dictionary term
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('createDictionaryTerm'), {
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
        functionName: 'createDictionaryTerm',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error creating dictionary term:', error);
    await logCloudFunctionError({
      functionName: 'createDictionaryTerm',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to create dictionary term' },
      { status: 500 }
    );
  }
}

// PUT /api/study/learning/dictionary - Update a dictionary term
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');
    const termId = request.nextUrl.searchParams.get('termId');

    const url = new URL(getCloudFunctionUrl('updateDictionaryTerm'));
    if (termId) url.searchParams.set('termId', termId);

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
        functionName: 'updateDictionaryTerm',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { termId },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error updating dictionary term:', error);
    await logCloudFunctionError({
      functionName: 'updateDictionaryTerm',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to update dictionary term' },
      { status: 500 }
    );
  }
}

// DELETE /api/study/learning/dictionary - Delete a dictionary term
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const termId = request.nextUrl.searchParams.get('termId');

    const url = new URL(getCloudFunctionUrl('deleteDictionaryTerm'));
    if (termId) url.searchParams.set('termId', termId);

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
        functionName: 'deleteDictionaryTerm',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { termId },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error deleting dictionary term:', error);
    await logCloudFunctionError({
      functionName: 'deleteDictionaryTerm',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to delete dictionary term' },
      { status: 500 }
    );
  }
}
