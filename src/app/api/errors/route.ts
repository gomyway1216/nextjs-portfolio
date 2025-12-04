// App Errors API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../constants';

// GET /api/errors - Get errors with filters
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const authHeader = request.headers.get('authorization');
    const url = new URL(getCloudFunctionUrl('getAppErrors'));

    // Forward query parameters
    const params = ['resolved', 'source', 'severity', 'limit'];
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

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Errors API] Error fetching errors:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch errors' },
      { status: 500 }
    );
  }
}

// POST /api/errors - Log a new error
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = getCloudFunctionUrl('logAppError');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Errors API] Error logging error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to log error' },
      { status: 500 }
    );
  }
}

// PUT /api/errors - Resolve an error
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');
    const { action, ...rest } = body;

    const functionName = action === 'unresolve' ? 'unresolveAppError' : 'resolveAppError';

    const response = await fetch(getCloudFunctionUrl(functionName), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify(rest),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Errors API] Error updating error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update error' },
      { status: 500 }
    );
  }
}

// DELETE /api/errors - Delete an error
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('deleteAppError'), {
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
    console.error('[Errors API] Error deleting error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete error' },
      { status: 500 }
    );
  }
}
