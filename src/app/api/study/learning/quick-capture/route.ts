// Quick Capture API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../constants';

// GET /api/study/learning/quick-capture - Get quick captures
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const authHeader = request.headers.get('authorization');
    const url = new URL(getCloudFunctionUrl('getQuickCaptures'));

    const status = searchParams.get('status');
    if (status) url.searchParams.set('status', status);

    const response = await fetch(url.toString(), {
      headers: {
        ...(authHeader && { Authorization: authHeader }),
      },
    });
    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error fetching quick captures:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch quick captures' },
      { status: 500 }
    );
  }
}

// POST /api/study/learning/quick-capture - Create a new quick capture
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('createQuickCapture'), {
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
    console.error('[Learning API] Error creating quick capture:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create quick capture' },
      { status: 500 }
    );
  }
}
