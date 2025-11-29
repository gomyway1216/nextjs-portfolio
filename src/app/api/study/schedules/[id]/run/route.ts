// Study Schedule Run Now API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../../constants';

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
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error running schedule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to run schedule' },
      { status: 500 }
    );
  }
}
