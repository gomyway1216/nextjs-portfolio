// Daily Learning Plan API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../constants';
import { logCloudFunctionError } from '../../../utils/errorLogger';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
const endpoint = '/api/study/learning/daily';

// GET /api/study/learning/daily - Get daily learning plan
export const GET = withActivityLog('next_api.study.learning.daily.GET', async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const authHeader = request.headers.get('authorization');
    const url = new URL(getCloudFunctionUrl('getDailyLearningPlan'));

    // Forward query parameters
    const params = ['date', 'pathId', 'regenerate'];
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
        functionName: 'getDailyLearningPlan',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Daily Learning API] Error fetching plan:', error);
    await logCloudFunctionError({
      functionName: 'getDailyLearningPlan',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch daily learning plan' },
      { status: 500 }
    );
  }
});

// PUT /api/study/learning/daily - Update daily plan item
export const PUT = withActivityLog('next_api.study.learning.daily.PUT', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('updateDailyPlanItem'), {
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
        functionName: 'updateDailyPlanItem',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { planId: body.planId, itemId: body.itemId },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Daily Learning API] Error updating item:', error);
    await logCloudFunctionError({
      functionName: 'updateDailyPlanItem',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to update daily plan item' },
      { status: 500 }
    );
  }
});
