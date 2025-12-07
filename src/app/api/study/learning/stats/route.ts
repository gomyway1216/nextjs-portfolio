// Learning Stats API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../constants';

// GET /api/study/learning/stats - Get learning statistics
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('getLearningStats'), {
      headers: {
        ...(authHeader && { Authorization: authHeader }),
      },
    });
    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error fetching learning stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch learning stats' },
      { status: 500 }
    );
  }
}
