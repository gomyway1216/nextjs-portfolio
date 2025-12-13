// Study Progress API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../constants';
import { logCloudFunctionError } from '../../utils/errorLogger';

const endpoint = '/api/study/progress';

// GET /api/study/progress - Get user's study progress
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('getUserStudyProgress'), {
      headers: {
        ...(authHeader && { Authorization: authHeader }),
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'getUserStudyProgress',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error fetching progress:', error);
    await logCloudFunctionError({
      functionName: 'getUserStudyProgress',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch progress' },
      { status: 500 }
    );
  }
}
