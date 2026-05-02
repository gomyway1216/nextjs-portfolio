// Activity Logs API — proxies to Cloud Function
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../constants';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
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
export const GET = withActivityLog('next_api.activity-logs.GET', async (request: NextRequest) => {
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
});
