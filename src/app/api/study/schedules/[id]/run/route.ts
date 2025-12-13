// Study Schedule Run Now API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../../constants';
import { logCloudFunctionError } from '../../../../utils/errorLogger';

// POST /api/study/schedules/[id]/run - Run a schedule immediately
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('runStudyScheduleNow'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify({ scheduleId: id }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'runStudyScheduleNow',
        endpoint: `/api/study/schedules/${id}/run`,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { scheduleId: id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error running schedule:', error);
    await logCloudFunctionError({
      functionName: 'runStudyScheduleNow',
      endpoint: '/api/study/schedules/[id]/run',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to run schedule' },
      { status: 500 }
    );
  }
}
