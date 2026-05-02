// Activity Log Traffic API — proxies to Cloud Function for the Overview tab
import { NextRequest, NextResponse } from 'next/server';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { getCloudFunctionUrl } from '../../constants';

const FORWARDED = [
  'agent_uid', 'agent_email', 'action', 'category', 'env', 'source',
  'is_anonymous', 'target_uid', 'start_date', 'end_date', 'granularity',
];

export const GET = withActivityLog('next_api.activity-logs.traffic.GET', async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const authHeader = request.headers.get('authorization');
    const url = new URL(getCloudFunctionUrl('activityLogTraffic'));

    FORWARDED.forEach((param) => {
      const value = searchParams.get(param);
      if (value !== null && value !== '') url.searchParams.set(param, value);
    });

    const response = await fetch(url.toString(), {
      headers: { ...(authHeader && { Authorization: authHeader }) },
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Activity Log Traffic API] Error fetching traffic:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch activity log traffic' },
      { status: 500 },
    );
  }
});
