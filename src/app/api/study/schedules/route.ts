// Study Schedules API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../constants';
import { logCloudFunctionError } from '../../utils/errorLogger';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
const endpoint = '/api/study/schedules';

// GET /api/study/schedules - Get all schedules
export const GET = withActivityLog('next_api.study.schedules.GET', async (request: NextRequest) => {
  try {
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('getStudySchedules'), {
      headers: {
        ...(authHeader && { Authorization: authHeader }),
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'getStudySchedules',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error fetching schedules:', error);
    await logCloudFunctionError({
      functionName: 'getStudySchedules',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch schedules' },
      { status: 500 }
    );
  }
});

// POST /api/study/schedules - Create a new schedule
export const POST = withActivityLog('next_api.study.schedules.POST', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('createStudySchedule'), {
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
        functionName: 'createStudySchedule',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error creating schedule:', error);
    await logCloudFunctionError({
      functionName: 'createStudySchedule',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to create schedule' },
      { status: 500 }
    );
  }
});

// PUT /api/study/schedules - Update a schedule
export const PUT = withActivityLog('next_api.study.schedules.PUT', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('updateStudySchedule'), {
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
        functionName: 'updateStudySchedule',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { scheduleId: body.id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error updating schedule:', error);
    await logCloudFunctionError({
      functionName: 'updateStudySchedule',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to update schedule' },
      { status: 500 }
    );
  }
});

// DELETE /api/study/schedules - Delete a schedule
export const DELETE = withActivityLog('next_api.study.schedules.DELETE', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('deleteStudySchedule'), {
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
        functionName: 'deleteStudySchedule',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { scheduleId: body.id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    await logCloudFunctionError({
      functionName: 'deleteStudySchedule',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to delete schedule' },
      { status: 500 }
    );
  }
});
