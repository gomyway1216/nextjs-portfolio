// Activity Logs API — proxies to Cloud Function.
// NOT wrapped with withActivityLog: this route IS the admin viewing the
// activity log, so wrapping it would create a feedback loop where every
// admin refresh writes a new log row that admin then sees.
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../constants';

const FORWARDED_FILTERS = [
  'agent_uid',
  'agent_email',
  'action',
  'result',
  'category',
  'severity',
  'env',
  'source',
  'is_anonymous',
  'request_id',
  'target_uid',
  'start_date',
  'end_date',
  'limit',
  'offset_doc_id',
];

// GET /api/activity-logs — query activity logs with filters
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const authHeader = request.headers.get('authorization');
    const url = new URL(getCloudFunctionUrl('activityLogs'));

    FORWARDED_FILTERS.forEach((param) => {
      const value = searchParams.get(param);
      if (value !== null && value !== '') url.searchParams.set(param, value);
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
