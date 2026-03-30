// Activity Logs API — proxies to Cloud Function
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../constants';

// GET /api/activity-logs - Query activity logs with filters
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const authHeader = request.headers.get('authorization');
    const url = new URL(getCloudFunctionUrl('activityLogs'));

    // Forward query parameters
    const params = ['action', 'result', 'category', 'request_id', 'start_date', 'end_date', 'limit', 'offset_doc_id'];
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
    console.error('[Activity Logs API] Error fetching logs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch activity logs' },
      { status: 500 }
    );
  }
}
