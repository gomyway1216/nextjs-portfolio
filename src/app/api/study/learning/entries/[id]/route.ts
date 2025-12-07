// Learning Entry by ID API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../../constants';

// GET /api/study/learning/entries/[id] - Get a single learning entry
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');

    const url = new URL(getCloudFunctionUrl('getLearningEntry'));
    url.searchParams.set('entryId', id);

    const response = await fetch(url.toString(), {
      headers: {
        ...(authHeader && { Authorization: authHeader }),
      },
    });
    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error fetching entry:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch learning entry' },
      { status: 500 }
    );
  }
}
