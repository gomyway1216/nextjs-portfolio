// Learning Entries API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../constants';

// GET /api/study/learning/entries - Get learning entries with filters
export async function GET(request: NextRequest) {
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

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error fetching entries:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch learning entries' },
      { status: 500 }
    );
  }
}

// POST /api/study/learning/entries - Create a new learning entry
export async function POST(request: NextRequest) {
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
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error creating entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create learning entry' },
      { status: 500 }
    );
  }
}

// PUT /api/study/learning/entries - Update a learning entry
export async function PUT(request: NextRequest) {
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
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error updating entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update learning entry' },
      { status: 500 }
    );
  }
}

// DELETE /api/study/learning/entries - Delete a learning entry
export async function DELETE(request: NextRequest) {
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
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error deleting entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete learning entry' },
      { status: 500 }
    );
  }
}
